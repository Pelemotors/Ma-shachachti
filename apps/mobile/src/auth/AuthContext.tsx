import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { NativeAuthProvider } from "../api/auth";
import {
  restoreSession,
  signInWithEmailPassword,
  signInWithNativeProvider,
  signOut as sessionSignOut,
  type AuthUser,
} from "./session";
import { getSupabase } from "../api/supabase";

type AuthState = {
  ready: boolean;
  user: AuthUser | null;
  error: string | null;
  signIn: (provider: NativeAuthProvider) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  enterPreview: () => void;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    try {
      const restored = await restoreSession();
      setUser(restored.user);
    } catch (caught) {
      setUser(null);
      setError(
        caught instanceof Error ? caught.message : "שגיאת טעינת סשן.",
      );
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // App lifecycle: refresh session when returning to foreground.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state !== "active") return;
      void getSupabase()
        .auth.getSession()
        .then(({ data }) => {
          if (data.session?.user) {
            const meta = data.session.user.user_metadata ?? {};
            const raw =
              (typeof meta.full_name === "string" && meta.full_name) ||
              (typeof meta.name === "string" && meta.name) ||
              (typeof meta.given_name === "string" && meta.given_name) ||
              null;
            setUser({
              id: data.session.user.id,
              email: data.session.user.email ?? null,
              displayName: raw,
            });
          }
        })
        .catch(() => undefined);
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      user,
      error,
      clearError: () => setError(null),
      signIn: async (provider) => {
        setError(null);
        try {
          const result = await signInWithNativeProvider(provider);
          setUser(result.user);
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "ההתחברות נכשלה.";
          setError(message);
          throw caught;
        }
      },
      signInWithEmail: async (email, password) => {
        setError(null);
        try {
          const result = await signInWithEmailPassword(email, password);
          setUser(result.user);
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "ההתחברות נכשלה.";
          setError(message);
          throw caught;
        }
      },
      enterPreview: () => {
        setError(null);
        setUser({ id: "ui-preview", email: null, displayName: null });
      },
      signOut: async () => {
        try {
          await sessionSignOut();
        } catch {
          /* preview / missing supabase */
        }
        setUser(null);
      },
    }),
    [ready, user, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
