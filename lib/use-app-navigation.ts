"use client";
import { useCallback, useEffect, useRef } from "react";

type ViewBase = string;

/**
 * Browser back from an internal app view returns to Home, not Login.
 * Home → Internal uses pushState; Internal → Internal uses replaceState.
 */
export function useAppNavigation<V extends string>(opts: {
  view: V;
  homeView: V;
  setView: (v: V) => void;
  enabled?: boolean;
}) {
  const { view, homeView, setView, enabled = true } = opts;
  const skip = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onPop = () => {
      if (skip.current) {
        skip.current = false;
        return;
      }
      if (view !== homeView) {
        setView(homeView);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [enabled, view, homeView, setView]);

  const navigate = useCallback(
    (next: V) => {
      if (!enabled || typeof window === "undefined") {
        setView(next);
        return;
      }
      if (view === homeView && next !== homeView) {
        window.history.pushState({ view: next }, "", window.location.href);
      } else if (view !== homeView && next !== homeView && next !== view) {
        window.history.replaceState({ view: next }, "", window.location.href);
      } else if (next === homeView && view !== homeView) {
        skip.current = true;
        window.history.back();
      }
      setView(next);
    },
    [enabled, homeView, setView, view],
  );

  return { navigate };
}

export function replaceAfterLogin(returnTarget: string) {
  if (typeof window === "undefined") return;
  window.location.replace(returnTarget);
}
