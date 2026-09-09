"use client";
import { useState, useCallback } from "react";
import { Action, AppState, Checklist } from "@/lib/model";

export function useChecklistController(
  checklists: AppState["checklists"],
  busy: boolean,
  run: (actions: Action[], confirmed?: boolean) => Promise<void>,
  act: (a: Action) => Promise<void>,
) {
  const [titleDraft, setTitleDraft] = useState("");
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [editingTitle, setEditingTitle] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const lists = [...checklists].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  const createList = useCallback(async () => {
    const title = titleDraft.trim();
    if (!title) return;
    try {
      await run([{ type: "checklist.create", title }], true);
      setTitleDraft("");
    } catch {}
  }, [run, titleDraft]);

  const renameList = useCallback(
    async (list: Checklist) => {
      const title = (editingTitle[list.id] ?? list.title).trim();
      if (!title || title === list.title) {
        setEditingTitle((prev) => {
          const next = { ...prev };
          delete next[list.id];
          return next;
        });
        return;
      }
      try {
        await run([{ type: "checklist.update", id: list.id, title }], true);
        setEditingTitle((prev) => {
          const next = { ...prev };
          delete next[list.id];
          return next;
        });
      } catch {}
    },
    [run, editingTitle],
  );

  const deleteList = useCallback(
    (id: string) => {
      void act({ type: "checklist.delete", id });
    },
    [act],
  );

  const addItem = useCallback(
    async (checklistId: string) => {
      const text = (itemDrafts[checklistId] ?? "").trim();
      if (!text) return;
      try {
        await run([{ type: "checklist.item.add", checklistId, text }], true);
        setItemDrafts((prev) => ({ ...prev, [checklistId]: "" }));
      } catch {}
    },
    [run, itemDrafts],
  );

  const toggleItem = useCallback(
    (checklistId: string, itemId: string, checked: boolean) => {
      void run([
        { type: "checklist.item.toggle", checklistId, itemId, checked },
      ]);
    },
    [run],
  );

  const removeItem = useCallback(
    (checklistId: string, itemId: string) => {
      void run([{ type: "checklist.item.remove", checklistId, itemId }], true);
    },
    [run],
  );

  const moveItem = useCallback(
    (list: Checklist, itemId: string, direction: -1 | 1) => {
      const ordered = [...list.items].sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((item) => item.id === itemId);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= ordered.length) return;
      const ids = ordered.map((item) => item.id);
      const [moved] = ids.splice(index, 1);
      if (!moved) return;
      ids.splice(next, 0, moved);
      void run(
        [
          {
            type: "checklist.item.reorder",
            checklistId: list.id,
            itemIds: ids,
          },
        ],
        true,
      );
    },
    [run],
  );

  const resetList = useCallback(
    (id: string) => {
      void run([{ type: "checklist.reset", id }], true);
    },
    [run],
  );

  return {
    lists,
    busy,
    titleDraft,
    setTitleDraft,
    itemDrafts,
    setItemDrafts,
    editingTitle,
    setEditingTitle,
    openId,
    setOpenId,
    createList,
    renameList,
    deleteList,
    addItem,
    toggleItem,
    removeItem,
    moveItem,
    resetList,
  };
}

export type ChecklistController = ReturnType<typeof useChecklistController>;
