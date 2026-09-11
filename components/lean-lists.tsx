"use client";

import { FormEvent, useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import type { Checklist, ShoppingItem } from "@/lib/lists";
import { OptimisticMutationLayer, type OptimisticFailure } from "@/lib/optimistic-mutation";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";

async function post<T>(url: string, body: unknown, key: string): Promise<T[]> {
  const response = await authFetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data[key])) throw new Error("mutation_failed");
  return data[key] as T[];
}

export function ShoppingView(props: {
  mutations: OptimisticMutationLayer;
  onFailure: (failure: OptimisticFailure | null) => void;
}) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  async function load() {
    setLoading(true); setLoadError("");
    const response = await authFetch("/api/shopping").catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok || !Array.isArray(body?.shopping)) setLoadError("לא הצלחנו לטעון את רשימת הקניות.");
    else setItems(body.shopping);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);
  async function add(event: FormEvent) {
    event.preventDefault();
    const value = title.trim(); if (!value) return;
    setTitle("");
    await props.mutations.run({
      key: `shopping:add:${value}`, current: () => items,
      optimistic: (snapshot) => [...snapshot, { id: `local-${value}`, title: value, quantity: 1, purchased_at: null, order_index: snapshot.length, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
      commit: () => post<ShoppingItem>("/api/shopping", { action: "add", title: value, quantity: 1 }, "shopping"),
      publish: setItems, errorMessage: "לא הצלחנו להוסיף את הפריט.",
    }, props.onFailure);
  }
  async function toggle(item: ShoppingItem) {
    await props.mutations.run({
      key: `shopping:toggle:${item.id}`, current: () => items,
      optimistic: (snapshot) => snapshot.map((row) => row.id === item.id ? { ...row, purchased_at: row.purchased_at ? null : new Date().toISOString() } : row),
      commit: () => post<ShoppingItem>("/api/shopping", { action: "toggle", id: item.id, purchased: !item.purchased_at }, "shopping"),
      publish: setItems, errorMessage: "לא הצלחנו לעדכן את הפריט.",
    }, props.onFailure);
  }
  return <section className="lists-panel" dir="rtl">
    <form className="task-create" onSubmit={add}>
      <input aria-label="פריט קניות חדש" maxLength={200} placeholder="מה צריך לקנות?" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button className="send-button" type="submit" disabled={!title.trim()}>+</button>
    </form>
    {loading ? <LoadingState label="טוען את רשימת הקניות…" compact /> : null}
    {loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : null}
    {!loading && !loadError && items.length === 0 ? (
      <EmptyState title="רשימת הקניות ריקה" description="אפשר להוסיף את הפריט הראשון למעלה." />
    ) : null}
    <ul className="task-list">
      {items.map((item) => <li className={`task-row${item.purchased_at ? " done" : ""}`} key={item.id}>
        <button className={`task-check${item.purchased_at ? " checked" : ""}`} aria-label={`סימון ${item.title}`} onClick={() => void toggle(item)} />
        <div className="task-copy"><span>{item.title}</span>{item.quantity > 1 ? <small>כמות: {item.quantity}</small> : null}</div>
        <button className="text-button" onClick={() => {
          const next = window.prompt("שם הפריט", item.title)?.trim();
          if (next) void post<ShoppingItem>("/api/shopping", { action: "update", id: item.id, title: next }, "shopping").then(setItems);
        }}>עריכה</button>
        <button className="text-button danger-text" onClick={() => void props.mutations.run({
          key: `shopping:remove:${item.id}`, current: () => items,
          optimistic: (snapshot) => snapshot.filter((row) => row.id !== item.id),
          commit: () => post<ShoppingItem>("/api/shopping", { action: "remove", id: item.id }, "shopping"),
          publish: setItems, errorMessage: "לא הצלחנו למחוק את הפריט.",
        }, props.onFailure)}>מחק</button>
      </li>)}
    </ul>
    {items.some((item) => item.purchased_at) ? <button className="text-button" onClick={() => void post<ShoppingItem>("/api/shopping", { action: "clear_purchased" }, "shopping").then(setItems)}>נקה פריטים שנקנו</button> : null}
  </section>;
}

function moved(ids: string[], index: number, delta: -1 | 1) {
  const target = index + delta; if (target < 0 || target >= ids.length) return ids;
  const next = [...ids]; [next[index], next[target]] = [next[target]!, next[index]!]; return next;
}

export function ChecklistsView(props: {
  activeId: string | null;
  onActive: (id: string | null, replace?: boolean) => void;
  mutations: OptimisticMutationLayer;
  onFailure: (failure: OptimisticFailure | null) => void;
}) {
  const [lists, setLists] = useState<Checklist[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  async function load() {
    setLoading(true); setLoadError("");
    const response = await authFetch("/api/checklists").catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok || !Array.isArray(body?.checklists)) {
      setLoadError("לא הצלחנו לטעון את הרשימות.");
    } else {
      const next = body.checklists as Checklist[]; setLists(next);
      if (props.activeId && !next.some((list) => list.id === props.activeId)) props.onActive(null, true);
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);
  const active = lists.find((list) => list.id === props.activeId) ?? null;
  const mutate = (key: string, optimistic: (value: Checklist[]) => Checklist[], body: unknown) =>
    props.mutations.run({ key, current: () => lists, optimistic, commit: () => post<Checklist>("/api/checklists", body, "checklists"), publish: setLists, errorMessage: "לא הצלחנו לעדכן את הרשימה." }, props.onFailure);
  if (!active) return <section className="lists-panel" dir="rtl">
    <form className="task-create" onSubmit={(event) => { event.preventDefault(); const title = text.trim(); if (!title) return; setText(""); void post<Checklist>("/api/checklists", { action: "create", title }, "checklists").then(setLists); }}>
      <input aria-label="רשימה חדשה" maxLength={200} placeholder="שם הרשימה" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="send-button" disabled={!text.trim()}>+</button>
    </form>
    {loading ? <LoadingState label="טוען רשימות…" compact /> : null}
    {loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : null}
    {!loading && !loadError && lists.length === 0 ? (
      <EmptyState title="אין עדיין רשימות" description="אפשר ליצור רשימה ראשונה למעלה." />
    ) : null}
    <ul className="task-list">{lists.map((list, index) => <li className="task-row" key={list.id}>
      <button className="text-button" onClick={() => props.onActive(list.id)}>{list.title} · {list.items.length}</button>
      <button aria-label="העלה רשימה" disabled={index === 0} onClick={() => { const ids = moved(lists.map((x) => x.id), index, -1); void mutate("checklist:reorder", (s) => ids.map((id) => s.find((x) => x.id === id)!), { action: "reorder", ids }); }}>↑</button>
      <button aria-label="הורד רשימה" disabled={index === lists.length - 1} onClick={() => { const ids = moved(lists.map((x) => x.id), index, 1); void mutate("checklist:reorder", (s) => ids.map((id) => s.find((x) => x.id === id)!), { action: "reorder", ids }); }}>↓</button>
      <button className="text-button" onClick={() => { const title = window.prompt("שם הרשימה", list.title)?.trim(); if (title) void post<Checklist>("/api/checklists", { action: "rename", id: list.id, title }, "checklists").then(setLists); }}>שינוי שם</button>
      <button className="text-button danger-text" onClick={() => { if (window.confirm(`למחוק את ${list.title}?`)) void post<Checklist>("/api/checklists", { action: "delete", id: list.id }, "checklists").then(setLists); }}>מחיקה</button>
    </li>)}</ul>
  </section>;
  return <section className="lists-panel" dir="rtl">
    <button className="text-button" onClick={() => props.onActive(null)}>כל הרשימות</button>
    <h2>{active.title}</h2>
    <form className="task-create" onSubmit={(event) => { event.preventDefault(); const value = text.trim(); if (!value) return; setText(""); void post<Checklist>("/api/checklists", { action: "item.add", checklist_id: active.id, text: value }, "checklists").then(setLists); }}>
      <input aria-label="פריט חדש ברשימה" maxLength={500} placeholder="פריט חדש" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="send-button" disabled={!text.trim()}>+</button>
    </form>
    {!active.items.length ? <EmptyState title="הרשימה ריקה" description="אפשר להוסיף פריט ראשון למעלה." /> : null}
    <ul className="task-list">{active.items.map((item, index) => <li className={`task-row${item.checked ? " done" : ""}`} key={item.id}>
      <button className={`task-check${item.checked ? " checked" : ""}`} aria-label={`סימון ${item.text}`} onClick={() => void mutate(`checklist:item:toggle:${item.id}`, (all) => all.map((list) => list.id === active.id ? { ...list, items: list.items.map((row) => row.id === item.id ? { ...row, checked: !row.checked } : row) } : list), { action: "item.toggle", checklist_id: active.id, id: item.id, checked: !item.checked })} />
      <span>{item.text}</span>
      <button aria-label="העלה פריט" disabled={index === 0} onClick={() => { const ids = moved(active.items.map((x) => x.id), index, -1); void mutate(`checklist:item:reorder:${active.id}`, (all) => all.map((list) => list.id === active.id ? { ...list, items: ids.map((id) => list.items.find((x) => x.id === id)!) } : list), { action: "item.reorder", checklist_id: active.id, ids }); }}>↑</button>
      <button aria-label="הורד פריט" disabled={index === active.items.length - 1} onClick={() => { const ids = moved(active.items.map((x) => x.id), index, 1); void mutate(`checklist:item:reorder:${active.id}`, (all) => all.map((list) => list.id === active.id ? { ...list, items: ids.map((id) => list.items.find((x) => x.id === id)!) } : list), { action: "item.reorder", checklist_id: active.id, ids }); }}>↓</button>
      <button className="text-button" onClick={() => { const text = window.prompt("תוכן הפריט", item.text)?.trim(); if (text) void post<Checklist>("/api/checklists", { action: "item.update", checklist_id: active.id, id: item.id, text }, "checklists").then(setLists); }}>עריכה</button>
      <button className="text-button danger-text" onClick={() => void post<Checklist>("/api/checklists", { action: "item.remove", checklist_id: active.id, id: item.id }, "checklists").then(setLists)}>מחיקה</button>
    </li>)}</ul>
    <button className="text-button" onClick={() => void mutate(`checklist:reset:${active.id}`, (all) => all.map((list) => list.id === active.id ? { ...list, items: list.items.map((item) => ({ ...item, checked: false })) } : list), { action: "reset", id: active.id })}>איפוס סימונים</button>
  </section>;
}
