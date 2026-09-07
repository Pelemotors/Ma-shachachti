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

async function withAuthHeaders(init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const auth = await authHeaders();
  headers.set("Authorization", auth.Authorization);
  return { ...init, headers };
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  let response = await fetch(input, await withAuthHeaders(init));
  if (response.status !== 401 || !supabase) return response;
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) return response;
  response = await fetch(input, await withAuthHeaders(init));
  return response;
}
