import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validDate = (value: unknown) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

export type LegacyListCounts = {
  shopping: number;
  checklists: number;
  checklistItems: number;
};

export function stableLegacyUuid(ownerId: string, kind: string, position: number, legacyId: unknown) {
  if (typeof legacyId === "string" && UUID.test(legacyId)) return legacyId;
  const hash = createHash("md5")
    .update(`${ownerId}:${kind}:${position}:${typeof legacyId === "string" ? legacyId : ""}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function parseLegacyQuantity(value: unknown) {
  const raw =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number" && Number.isInteger(value)
        ? String(value)
        : "";
  if (!/^[0-9]+$/.test(raw)) return 1;
  const quantity = Number(raw);
  return quantity >= 1 && quantity <= 999 ? quantity : 1;
}

export function parseLegacyLists(rows: unknown[]): {
  shopping: Array<Record<string, unknown>>;
  checklists: Array<Record<string, unknown> & { items: Array<Record<string, unknown>> }>;
  counts: LegacyListCounts;
} {
  const shopping: Array<Record<string, unknown>> = [];
  const checklists: Array<Record<string, unknown> & { items: Array<Record<string, unknown>> }> = [];
  for (const rowValue of rows) {
    if (!rowValue || typeof rowValue !== "object" || Array.isArray(rowValue)) continue;
    const row = rowValue as Record<string, unknown>;
    if (typeof row.owner_id !== "string" || !UUID.test(row.owner_id)) continue;
    if (!row.data || typeof row.data !== "object" || Array.isArray(row.data)) continue;
    const data = row.data as Record<string, unknown>;
    if (Array.isArray(data.shopping)) {
      data.shopping.forEach((value, position) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return;
        const item = value as Record<string, unknown>;
        const title = typeof item.title === "string" ? item.title.trim() : "";
        if (!title || title.length > 200) return;
        const quantity = parseLegacyQuantity(item.quantity);
        shopping.push({
          id: stableLegacyUuid(row.owner_id as string, "shopping", position, item.id),
          user_id: row.owner_id, title, quantity,
          created_at: validDate(item.createdAt) ? item.createdAt : row.updated_at,
          purchased_at: item.purchasedAt === null || !validDate(item.purchasedAt) ? null : item.purchasedAt,
          order_index: position,
        });
      });
    }
    if (Array.isArray(data.checklists)) {
      data.checklists.forEach((value, listPosition) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return;
        const list = value as Record<string, unknown>;
        const title = typeof list.title === "string" ? list.title.trim() : "";
        if (!title || title.length > 200) return;
        const listId = stableLegacyUuid(row.owner_id as string, "checklist", listPosition, list.id);
        const items: Array<Record<string, unknown>> = [];
        if (Array.isArray(list.items)) {
          list.items.forEach((itemValue, position) => {
            if (!itemValue || typeof itemValue !== "object" || Array.isArray(itemValue)) return;
            const item = itemValue as Record<string, unknown>;
            const text = typeof item.text === "string" ? item.text.trim() : "";
            if (!text || text.length > 500) return;
            items.push({
              id: stableLegacyUuid(row.owner_id as string, `checklist-item:${listId}`, position, item.id),
              checklist_id: listId, user_id: row.owner_id, text,
              checked: item.checked === true,
              order_index: Number.isInteger(item.order) && Number(item.order) >= 0 ? item.order : position,
              created_at: validDate(item.createdAt) ? item.createdAt : row.updated_at,
              updated_at: validDate(item.updatedAt) ? item.updatedAt : item.createdAt ?? row.updated_at,
            });
          });
        }
        checklists.push({
          id: listId, user_id: row.owner_id, title, order_index: listPosition,
          created_at: validDate(list.createdAt) ? list.createdAt : row.updated_at,
          updated_at: validDate(list.updatedAt) ? list.updatedAt : list.createdAt ?? row.updated_at,
          items,
        });
      });
    }
  }
  return {
    shopping,
    checklists,
    counts: {
      shopping: shopping.length,
      checklists: checklists.length,
      checklistItems: checklists.reduce((total, list) => total + list.items.length, 0),
    },
  };
}

export function verifyProductionListShape(rows: unknown[]) {
  const parsed = parseLegacyLists(rows);
  return {
    ...parsed.counts,
    matches: parsed.counts.shopping === 33 &&
      parsed.counts.checklists === 1 &&
      parsed.counts.checklistItems === 4,
  };
}
