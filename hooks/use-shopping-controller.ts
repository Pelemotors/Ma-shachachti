"use client";
import { useState, useCallback } from "react";
import { Action, AppState } from "@/lib/model";

export function useShoppingController(
  shopping: AppState["shopping"],
  busy: boolean,
  run: (actions: Action[], confirmed?: boolean) => Promise<void>,
  act: (a: Action) => Promise<void>,
) {
  const [newItem, setNewItem] = useState("");
  const [quantity, setQuantity] = useState("");

  const items = [...shopping].sort(
    (a, b) => Number(!!a.purchasedAt) - Number(!!b.purchasedAt),
  );

  const addItem = useCallback(async () => {
    try {
      await run([{ type: "shopping.add", title: newItem, quantity }]);
      setNewItem("");
      setQuantity("");
    } catch {}
  }, [run, newItem, quantity]);

  const toggleItem = useCallback(
    (id: string, checked: boolean) => {
      void act({ type: "shopping.check", id, checked });
    },
    [act],
  );

  const removeItem = useCallback(
    (id: string) => {
      void act({ type: "shopping.remove", id });
    },
    [act],
  );

  return {
    newItem,
    setNewItem,
    quantity,
    setQuantity,
    items,
    busy,
    addItem,
    toggleItem,
    removeItem,
  };
}

export type ShoppingController = ReturnType<typeof useShoppingController>;
