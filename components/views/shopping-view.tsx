import { AppState } from "@/lib/model";
import { ViewHeader } from "@/components/view-header";
import { Empty } from "@/components/empty-state";

export function ShoppingView(props: {
  newItem: string;
  quantity: string;
  busy: boolean;
  items: AppState["shopping"];
  empty: boolean;
  onNewItem: (v: string) => void;
  onQuantity: (v: string) => void;
  onAdd: () => void;
  onToggle: (id: string, checked: boolean) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      <ViewHeader view="shopping" />
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          props.onAdd();
        }}
      >
        <input
          aria-label="פריט לקניות"
          placeholder="מה לקנות?"
          value={props.newItem}
          onChange={(e) => props.onNewItem(e.target.value)}
          required
        />
        <input
          aria-label="כמות"
          placeholder="כמות"
          value={props.quantity}
          onChange={(e) => props.onQuantity(e.target.value)}
        />
        <button className="primary" disabled={props.busy}>
          הוספה
        </button>
      </form>
      <div className="task-list">
        {props.items.map((item) => (
          <div className="shopping-item" key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={Boolean(item.purchasedAt)}
                onChange={(e) => props.onToggle(item.id, e.target.checked)}
              />
              <span>
                {item.title}
                {item.quantity ? ` · ${item.quantity}` : ""}
              </span>
            </label>
            <button
              className="text-button"
              onClick={() => props.onRemove(item.id)}
            >
              הסרה
            </button>
          </div>
        ))}
      </div>
      {props.empty && <Empty text="הרשימה מחכה לדברים שחסרים בבית." />}
      <button className="secondary" onClick={() => window.print()}>
        הדפסה / שמירה כ־PDF
      </button>
    </>
  );
}
