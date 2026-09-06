import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export async function authHeaders() {
  const { data } = (await supabase?.auth.getSession()) ?? {
    data: { session: null },
  };
  return data.session
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : { Authorization: "" };
}
