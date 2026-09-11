import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const shoppingMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), title: z.string().trim().min(1).max(200), quantity: z.number().int().min(1).max(999).default(1) }).strict(),
  z.object({ action: z.literal("update"), id: z.string().uuid(), title: z.string().trim().min(1).max(200).optional(), quantity: z.number().int().min(1).max(999).optional() }).strict(),
  z.object({ action: z.literal("toggle"), id: z.string().uuid(), purchased: z.boolean() }).strict(),
  z.object({ action: z.literal("remove"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("clear_purchased") }).strict(),
]);

export const checklistMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), title: z.string().trim().min(1).max(200) }).strict(),
  z.object({ action: z.literal("rename"), id: z.string().uuid(), title: z.string().trim().min(1).max(200) }).strict(),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("reset"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("reorder"), ids: z.array(z.string().uuid()).min(1).max(200) }).strict(),
  z.object({ action: z.literal("item.add"), checklist_id: z.string().uuid(), text: z.string().trim().min(1).max(500) }).strict(),
  z.object({ action: z.literal("item.update"), checklist_id: z.string().uuid(), id: z.string().uuid(), text: z.string().trim().min(1).max(500) }).strict(),
  z.object({ action: z.literal("item.toggle"), checklist_id: z.string().uuid(), id: z.string().uuid(), checked: z.boolean() }).strict(),
  z.object({ action: z.literal("item.remove"), checklist_id: z.string().uuid(), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("item.reorder"), checklist_id: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(500) }).strict(),
]);

export type ShoppingItem = {
  id: string; title: string; quantity: number; purchased_at: string | null;
  order_index: number; created_at: string; updated_at: string;
};
export type ChecklistItem = {
  id: string; checklist_id: string; text: string; checked: boolean;
  order_index: number; created_at: string; updated_at: string;
};
export type Checklist = {
  id: string; title: string; order_index: number; created_at: string;
  updated_at: string; items: ChecklistItem[];
};

type Db = SupabaseClient;

export async function loadShopping(db: Db, userId: string): Promise<ShoppingItem[]> {
  const { data, error } = await db.from("shopping_items")
    .select("id,title,quantity,purchased_at,order_index,created_at,updated_at")
    .eq("user_id", userId).order("order_index").order("created_at");
  if (error) throw error;
  return (data ?? []) as ShoppingItem[];
}

export async function mutateShopping(db: Db, userId: string, input: z.infer<typeof shoppingMutationSchema>) {
  const now = new Date().toISOString();
  if (input.action === "add") {
    const { data: last } = await db.from("shopping_items").select("order_index").eq("user_id", userId).order("order_index", { ascending: false }).limit(1).maybeSingle();
    const { error } = await db.from("shopping_items").insert({ user_id: userId, title: input.title, quantity: input.quantity, order_index: Number(last?.order_index ?? -1) + 1 });
    if (error) throw error;
  } else if (input.action === "clear_purchased") {
    const { error } = await db.from("shopping_items").delete().eq("user_id", userId).not("purchased_at", "is", null);
    if (error) throw error;
  } else if (input.action === "remove") {
    const { error } = await db.from("shopping_items").delete().eq("user_id", userId).eq("id", input.id);
    if (error) throw error;
  } else {
    const patch = input.action === "toggle"
      ? { purchased_at: input.purchased ? now : null, updated_at: now }
      : { ...(input.title !== undefined ? { title: input.title } : {}), ...(input.quantity !== undefined ? { quantity: input.quantity } : {}), updated_at: now };
    const { data, error } = await db.from("shopping_items").update(patch).eq("user_id", userId).eq("id", input.id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("shopping_item_not_found");
  }
  return loadShopping(db, userId);
}

export async function loadChecklists(db: Db, userId: string): Promise<Checklist[]> {
  const [{ data: lists, error }, { data: items, error: itemError }] = await Promise.all([
    db.from("checklists").select("id,title,order_index,created_at,updated_at").eq("user_id", userId).order("order_index").order("created_at"),
    db.from("checklist_items").select("id,checklist_id,text,checked,order_index,created_at,updated_at").eq("user_id", userId).order("order_index").order("created_at"),
  ]);
  if (error || itemError) throw error ?? itemError;
  return (lists ?? []).map((list) => ({
    ...list,
    items: (items ?? []).filter((item) => item.checklist_id === list.id),
  })) as Checklist[];
}

async function ownChecklist(db: Db, userId: string, id: string) {
  const { data, error } = await db.from("checklists").select("id").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("checklist_not_found");
}

async function applyOrder(db: Db, table: "checklists" | "checklist_items", userId: string, ids: string[], checklistId?: string) {
  if (new Set(ids).size !== ids.length) throw new Error("duplicate_ids");
  let owned = db.from(table).select("id").eq("user_id", userId).in("id", ids);
  if (checklistId) owned = owned.eq("checklist_id", checklistId);
  const { data: ownedRows, error: ownershipError } = await owned;
  if (ownershipError || ownedRows?.length !== ids.length) {
    throw ownershipError ?? new Error("foreign_row");
  }
  for (const [order_index, id] of ids.entries()) {
    let query = db.from(table).update({ order_index, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", id);
    if (checklistId) query = query.eq("checklist_id", checklistId);
    const { data, error } = await query.select("id").maybeSingle();
    if (error || !data) throw error ?? new Error("foreign_row");
  }
}

export async function mutateChecklist(db: Db, userId: string, input: z.infer<typeof checklistMutationSchema>) {
  const now = new Date().toISOString();
  if (input.action === "create") {
    const { data: last } = await db.from("checklists").select("order_index").eq("user_id", userId).order("order_index", { ascending: false }).limit(1).maybeSingle();
    const { error } = await db.from("checklists").insert({ user_id: userId, title: input.title, order_index: Number(last?.order_index ?? -1) + 1 });
    if (error) throw error;
  } else if (input.action === "rename") {
    const { data, error } = await db.from("checklists").update({ title: input.title, updated_at: now }).eq("user_id", userId).eq("id", input.id).select("id").maybeSingle();
    if (error || !data) throw error ?? new Error("checklist_not_found");
  } else if (input.action === "delete") {
    const { data, error } = await db.from("checklists").delete().eq("user_id", userId).eq("id", input.id).select("id").maybeSingle();
    if (error || !data) throw error ?? new Error("checklist_not_found");
  } else if (input.action === "reset") {
    await ownChecklist(db, userId, input.id);
    const { error } = await db.from("checklist_items").update({ checked: false, updated_at: now }).eq("user_id", userId).eq("checklist_id", input.id);
    if (error) throw error;
  } else if (input.action === "reorder") {
    await applyOrder(db, "checklists", userId, input.ids);
  } else {
    await ownChecklist(db, userId, input.checklist_id);
    if (input.action === "item.add") {
      const { data: last } = await db.from("checklist_items").select("order_index").eq("user_id", userId).eq("checklist_id", input.checklist_id).order("order_index", { ascending: false }).limit(1).maybeSingle();
      const { error } = await db.from("checklist_items").insert({ user_id: userId, checklist_id: input.checklist_id, text: input.text, order_index: Number(last?.order_index ?? -1) + 1 });
      if (error) throw error;
    } else if (input.action === "item.reorder") {
      await applyOrder(db, "checklist_items", userId, input.ids, input.checklist_id);
    } else if (input.action === "item.remove") {
      const { data, error } = await db.from("checklist_items").delete().eq("user_id", userId).eq("checklist_id", input.checklist_id).eq("id", input.id).select("id").maybeSingle();
      if (error || !data) throw error ?? new Error("item_not_found");
    } else {
      const patch = input.action === "item.toggle" ? { checked: input.checked, updated_at: now } : { text: input.text, updated_at: now };
      const { data, error } = await db.from("checklist_items").update(patch).eq("user_id", userId).eq("checklist_id", input.checklist_id).eq("id", input.id).select("id").maybeSingle();
      if (error || !data) throw error ?? new Error("item_not_found");
    }
  }
  return loadChecklists(db, userId);
}
