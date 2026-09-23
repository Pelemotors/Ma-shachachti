import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { getForgotten, type ForgottenSection } from "../../api/forgot";
import { listNotifications } from "../../api/notifications";
import { getProfile } from "../../api/profile";
import { getSupabase } from "../../api/supabase";
import { listTasks } from "../../api/tasks";
import { greetingName } from "../../product/greeting";
import { forgottenFromTasks } from "../../product/forgottenSelect";
import { FORGOT_V4_VISUAL_QA, forgotV4Fixture } from "./forgotV4Fixture";

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

export function useForgotV4Data() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);
  const [sections, setSections] = useState<ForgottenSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    if (__DEV__ && FORGOT_V4_VISUAL_QA) {
      setSections(forgotV4Fixture.sections);
      setError("");
      setLoading(false);
      return;
    }
    const results = await Promise.allSettled([getForgotten(), getProfile(), listNotifications(), listTasks()]);
    const surface = settled(results[0], { date: "", sections: [] as ForgottenSection[] });
    const profile = settled(results[1], { profile: { user_id: "", display_name: null } });
    const notes = settled(results[2], { notifications: [] });
    const tasks = settled(results[3], { tasks: [] });
    setSections(surface.sections.length ? surface.sections : forgottenFromTasks(tasks.tasks));
    setDisplayName(greetingName(profile.profile.display_name));
    setUnread(notes.notifications.some((item) => !item.opened_at));
    try {
      const { data } = await getSupabase().auth.getUser();
      const meta = data.user?.user_metadata ?? {};
      setAvatarUrl(
        (typeof meta.avatar_url === "string" && meta.avatar_url) ||
          (typeof meta.picture === "string" && meta.picture) ||
          null,
      );
    } catch {
      setAvatarUrl(null);
    }
    setError(
      results[0].status === "rejected" && results[3].status === "rejected"
        ? "לא הצלחנו לטעון את הרשימה."
        : "",
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload({ silent: true });
    });
    return () => sub.remove();
  }, [reload]);

  return { displayName, avatarUrl, unread, sections, loading, error, reload };
}
