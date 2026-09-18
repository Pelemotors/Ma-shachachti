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
            setUser({
              id: data.session.user.id,
              email: data.session.user.email ?? null,
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
      signOut: async () => {
        await sessionSignOut();
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
