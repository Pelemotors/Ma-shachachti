import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./server-auth.ts";

const MAX_MEMBERS = 2;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createInviteToken() {
  const token = randomBytes(24).toString("hex");
  return { token, token_hash: hashInviteToken(token) };
}

export function inviteUsable(row: {
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}) {
  if (row.accepted_at || row.revoked_at) return false;
  return Date.parse(row.expires_at) > Date.now();
}

export async function loadMembership(
  db: SupabaseClient,
  userId: string,
) {
  const { data, error } = await db
    .from("household_members")
    .select("household_id,role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new HttpError(503, "לא הצלחנו לטעון את המרחב המשותף.");
  return data as { household_id: string; role: "owner" | "member" } | null;
}

export async function createHousehold(
  admin: SupabaseClient,
  userId: string,
  title = "הבית",
) {
  const existing = await loadMembership(admin, userId);
  if (existing) throw new HttpError(409, "כבר יש מרחב משותף.");
  const { data: household, error } = await admin
    .from("households")
    .insert({ owner_id: userId, title })
    .select("id,owner_id,title")
    .single();
  if (error || !household) throw new HttpError(503, "יצירת המרחב נכשלה.");
  const { error: memberError } = await admin.from("household_members").insert({
    household_id: household.id,
    user_id: userId,
    role: "owner",
  });
  if (memberError) throw new HttpError(503, "יצירת החברות נכשלה.");
  return household;
}

export async function createInvite(
  admin: SupabaseClient,
  userId: string,
) {
  const membership = await loadMembership(admin, userId);
  if (!membership) throw new HttpError(404, "אין מרחב משותף.");
  const { count } = await admin
    .from("household_members")
    .select("user_id", { count: "exact", head: true })
    .eq("household_id", membership.household_id);
  if ((count ?? 0) >= MAX_MEMBERS) {
    throw new HttpError(409, "המרחב כבר מלא.");
  }
  const { token, token_hash } = createInviteToken();
  const { error } = await admin.from("household_invites").insert({
    household_id: membership.household_id,
    created_by: userId,
    token_hash,
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  });
  if (error) throw new HttpError(503, "יצירת ההזמנה נכשלה.");
  return { token, expires_in_days: 7 };
}

export async function acceptInvite(
  admin: SupabaseClient,
  userId: string,
  token: string,
) {
  const existing = await loadMembership(admin, userId);
  if (existing) throw new HttpError(409, "כבר יש מרחב משותף.");
  const { data: invite, error } = await admin
    .from("household_invites")
    .select("id,household_id,expires_at,accepted_at,revoked_at")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  if (error || !invite) throw new HttpError(404, "ההזמנה לא נמצאה.");
  if (!inviteUsable(invite)) throw new HttpError(410, "ההזמנה אינה בתוקף.");
  const { count } = await admin
    .from("household_members")
    .select("user_id", { count: "exact", head: true })
    .eq("household_id", invite.household_id);
  if ((count ?? 0) >= MAX_MEMBERS) throw new HttpError(409, "המרחב כבר מלא.");
  const { error: memberError } = await admin.from("household_members").insert({
    household_id: invite.household_id,
    user_id: userId,
    role: "member",
  });
  if (memberError) throw new HttpError(503, "הצטרפות נכשלה.");
  await admin
    .from("household_invites")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
    })
    .eq("id", invite.id);
  return { household_id: invite.household_id };
}

export async function revokeInvite(
  admin: SupabaseClient,
  userId: string,
  inviteId: string,
) {
  const membership = await loadMembership(admin, userId);
  if (!membership) throw new HttpError(404, "אין מרחב משותף.");
  const { error, data } = await admin
    .from("household_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("household_id", membership.household_id)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new HttpError(503, "ביטול ההזמנה נכשל.");
  if (!data) throw new HttpError(404, "ההזמנה לא נמצאה.");
}

/**
 * Leave / remove: remaining member becomes owner of shared rows.
 * Last member: household deleted (cascades invites/membership; UGC household_id SET NULL).
 */
export async function leaveHousehold(admin: SupabaseClient, userId: string) {
  const membership = await loadMembership(admin, userId);
  if (!membership) throw new HttpError(404, "אין מרחב משותף.");
  const { data: members } = await admin
    .from("household_members")
    .select("user_id,role")
    .eq("household_id", membership.household_id);
  const others = (members ?? []).filter((row) => row.user_id !== userId);
  if (others.length === 1) {
    await admin
      .from("households")
      .update({ owner_id: others[0].user_id, updated_at: new Date().toISOString() })
      .eq("id", membership.household_id);
    await admin
      .from("household_members")
      .update({ role: "owner" })
      .eq("household_id", membership.household_id)
      .eq("user_id", others[0].user_id);
    await transferSharedToUser(admin, membership.household_id, others[0].user_id);
  }
  await admin
    .from("household_members")
    .delete()
    .eq("household_id", membership.household_id)
    .eq("user_id", userId);
  if (others.length === 0) {
    await admin.from("households").delete().eq("id", membership.household_id);
  }
}

async function transferSharedToUser(
  admin: SupabaseClient,
  householdId: string,
  remainingUserId: string,
) {
  const now = new Date().toISOString();
  for (const table of ["tasks", "shopping_items", "checklists"] as const) {
    await admin
      .from(table)
      .update({ user_id: remainingUserId, updated_at: now })
      .eq("household_id", householdId);
  }
  await admin
    .from("day_plans")
    .update({
      scope_type: "user",
      scope_id: remainingUserId,
      updated_at: now,
    })
    .eq("scope_type", "household")
    .eq("scope_id", householdId);
}

export async function prepareAccountDeletionHousehold(
  admin: SupabaseClient,
  userId: string,
) {
  const membership = await loadMembership(admin, userId);
  if (!membership) return;
  await leaveHousehold(admin, userId);
}
