import { AppState, Checklist } from "@/lib/model";
import { ViewHeader } from "@/components/view-header";
import { Empty } from "@/components/empty-state";
import type { ChecklistController } from "@/hooks/use-checklist-controller";

export function ChecklistsView(props: {
  lists: AppState["checklists"];
  busy: boolean;
  titleDraft: string;
  itemDrafts: Record<string, string>;
  editingTitle: Record<string, string>;
  openId: string | null;
  onTitleDraft: (v: string) => void;
  onItemDraft: (id: string, v: string) => void;
  onEditingTitle: (id: string, v: string) => void;
  onOpen: (id: string | null) => void;
  onCreate: () => void;
  onRename: (list: Checklist) => void;
  onDelete: (id: string) => void;
  onAddItem: (id: string) => void;
  onToggle: (checklistId: string, itemId: string, checked: boolean) => void;
  onRemoveItem: (checklistId: string, itemId: string) => void;
  onMoveItem: (list: Checklist, itemId: string, direction: -1 | 1) => void;
  onReset: (id: string) => void;
}) {
  return (
    <>
      <ViewHeader view="checklists" />
      <p className="muted">
        רשימות לשימוש חוזר. אפשר לערוך הכול כאן, בלי שיחה עם הסוכן.
      </p>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          props.onCreate();
        }}
      >
        <input
          aria-label="שם צ׳קליסט חדש"
          placeholder="שם הצ׳קליסט"
          value={props.titleDraft}
          onChange={(e) => props.onTitleDraft(e.target.value)}
          required
        />
        <button className="primary" disabled={props.busy}>
          יצירה
        </button>
      </form>
      <div className="checklist-library" role="list">
        {props.lists.map((list) => {
          const open = props.openId === list.id;
          const items = [...list.items].sort((a, b) => a.order - b.order);
          const checkedCount = items.filter((item) => item.checked).length;
          return (
            <article
              className="checklist-card"
              key={list.id}
              role="listitem"
            >
              <header className="checklist-card-head">
                <button
                  type="button"
                  className="checklist-open"
                  aria-expanded={open}
                  onClick={() => props.onOpen(open ? null : list.id)}
                >
                  <strong>{list.title}</strong>
                  <small>
                    {checkedCount}/{items.length} סומנו
                  </small>
                </button>
                <button
                  type="button"
                  className="text-button"
                  aria-label={`מחיקת ${list.title}`}
                  onClick={() => props.onDelete(list.id)}
                >
                  מחיקה
                </button>
              </header>
              {open && (
                <div className="checklist-body">
                  <form
                    className="add-row compact"
                    onSubmit={(e) => {
                      e.preventDefault();
                      props.onRename(list);
                    }}
                  >
                    <input
                      aria-label={`שינוי שם ${list.title}`}
                      value={props.editingTitle[list.id] ?? list.title}
                      onChange={(e) =>
                        props.onEditingTitle(list.id, e.target.value)
                      }
                    />
                    <button className="secondary" disabled={props.busy}>
                      שינוי שם
                    </button>
                  </form>
                  <div className="shopping-list" role="list">
                    {items.map((item) => (
                      <div
                        className={
                          "shopping-item" + (item.checked ? " is-done" : "")
                        }
                        key={item.id}
                        role="listitem"
                      >
                        <label className="shopping-item-main">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(e) =>
                              props.onToggle(
                                list.id,
                                item.id,
                                e.target.checked,
                              )
                            }
                            aria-label={item.text}
                          />
                          <span className="shopping-item-text">
                            <span className="shopping-item-title">
                              {item.text}
                            </span>
                          </span>
                        </label>
                        <div className="checklist-item-actions">
                          <button
                            type="button"
                            className="text-button"
                            aria-label={`העלאת ${item.text}`}
                            onClick={() => props.onMoveItem(list, item.id, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            aria-label={`הורדת ${item.text}`}
                            onClick={() => props.onMoveItem(list, item.id, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="text-button shopping-item-remove"
                            aria-label={`הסרת ${item.text}`}
                            onClick={() =>
                              props.onRemoveItem(list.id, item.id)
                            }
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <form
                    className="add-row compact"
                    onSubmit={(e) => {
                      e.preventDefault();
                      props.onAddItem(list.id);
                    }}
                  >
                    <input
                      aria-label={`פריט חדש ל${list.title}`}
                      placeholder="פריט חדש"
                      value={props.itemDrafts[list.id] ?? ""}
                      onChange={(e) =>
                        props.onItemDraft(list.id, e.target.value)
                      }
                    />
                    <button className="secondary" disabled={props.busy}>
                      הוספה
                    </button>
                  </form>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => props.onReset(list.id)}
                    disabled={props.busy || checkedCount === 0}
                  >
                    איפוס סימונים
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {props.lists.length === 0 && (
        <Empty text="אפשר להתחיל בצ׳קליסט ליציאה, לטיול או לכל דבר שחוזר." />
      )}
    </>
  );
}

export function checklistViewProps(ctrl: ChecklistController) {
  return {
    lists: ctrl.lists,
    busy: ctrl.busy,
    titleDraft: ctrl.titleDraft,
    itemDrafts: ctrl.itemDrafts,
    editingTitle: ctrl.editingTitle,
    openId: ctrl.openId,
    onTitleDraft: ctrl.setTitleDraft,
    onItemDraft: (id: string, v: string) =>
      ctrl.setItemDrafts((prev) => ({ ...prev, [id]: v })),
    onEditingTitle: (id: string, v: string) =>
      ctrl.setEditingTitle((prev) => ({ ...prev, [id]: v })),
    onOpen: ctrl.setOpenId,
    onCreate: () => void ctrl.createList(),
    onRename: (list: Checklist) => void ctrl.renameList(list),
    onDelete: ctrl.deleteList,
    onAddItem: (id: string) => void ctrl.addItem(id),
    onToggle: ctrl.toggleItem,
    onRemoveItem: ctrl.removeItem,
    onMoveItem: ctrl.moveItem,
    onReset: ctrl.resetList,
  };
}
