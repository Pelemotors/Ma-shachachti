import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const session = (await supabase?.auth.getSession())?.data.session;
  const headers = new Headers(init.headers);
  headers.set("Authorization", session ? `Bearer ${session.access_token}` : "");
  return fetch(input, { ...init, headers });
}
