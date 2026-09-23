import { useCallback, useEffect, useState } from "react";
import { listNotifications } from "../../api/notifications";
import { getProfile } from "../../api/profile";
import { getSupabase } from "../../api/supabase";

export function useChatV4Chrome() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);

  const reload = useCallback(async () => {
    const [notes, auth] = await Promise.allSettled([
      listNotifications(),
      getSupabase().auth.getUser(),
      getProfile(),
    ]);
    if (notes.status === "fulfilled") {
      setUnread(notes.value.notifications.some((item) => !item.opened_at));
    }
    if (auth.status === "fulfilled") {
      const meta = auth.value.data.user?.user_metadata ?? {};
      const avatar =
        (typeof meta.avatar_url === "string" && meta.avatar_url) ||
        (typeof meta.picture === "string" && meta.picture) ||
        null;
      setAvatarUrl(avatar);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { avatarUrl, unread, reload };
}
