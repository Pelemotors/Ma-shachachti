import type { RefObject } from "react";
import { Plus } from "lucide-react";
import { Action, AppState } from "@/lib/model";
import { ViewHeader } from "@/components/view-header";
import { describe } from "@/components/action-describe";

export function ChatView(props: {
  state: AppState;
  busy: boolean;
  context: string | null;
  thinking: boolean;
  proposal: Action[] | null;
  chatBottomRef: RefObject<HTMLDivElement | null>;
  onClearContext: () => void;
  onNewTask: () => void;
  onSetDraft: (t: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <ViewHeader view="chat">
        <button
          className="icon-button"
          aria-label="הוספת משימה ידנית"
          onClick={props.onNewTask}
        >
          <Plus size={20} />
        </button>
      </ViewHeader>
      {props.context && (
        <div className="context-chip">
          מדברים על:{" "}
          {props.state.tasks.find((t) => t.id === props.context)?.title ??
            "המשימה"}
          <button onClick={props.onClearContext}>סיום ההקשר</button>
        </div>
      )}
      {!props.state.messages.length && (
        <div className="chat-welcome">
          <div className="brand-mark">מ׳</div>
          <h2>אפשר פשוט לכתוב.</h2>
          <p>
            משהו לזכור, משהו שכבר נעשה,
            <br />
            או יום שצריך לעשות בו קצת סדר.
          </p>
          <div className="prompt-chips">
            {["צריך לקפל כביסה", "אולי להכין פשטידה", "יש לי מעט כוח היום"].map(
              (t) => (
                <button key={t} onClick={() => props.onSetDraft(t)}>
                  {t}
                </button>
              ),
            )}
          </div>
        </div>
      )}
      <div className="messages" aria-live="polite">
        {props.state.messages.map((m) => (
          <div key={m.id} className={"message " + m.role}>
            <span className="sr-only">
              {m.role === "user" ? "ההודעה שלך" : "העוזר"}:{" "}
            </span>
            <p>{m.text}</p>
          </div>
        ))}
        {props.thinking && (
          <div className="message assistant">
            <p>חושב איתך…</p>
          </div>
        )}
        {props.proposal && (
          <div className="proposal">
            <strong>אלה השינויים המוצעים</strong>
            <ul>
              {props.proposal.map((a, i) => (
                <li key={i}>
                  {describe(a)}
                  {"id" in a && props.state.tasks.find((t) => t.id === a.id)
                    ? ` — ${props.state.tasks.find((t) => t.id === a.id)?.title}`
                    : ""}
                </li>
              ))}
            </ul>
            <div className="button-row">
              <button
                className="primary"
                disabled={props.busy}
                onClick={() => void props.onApprove()}
              >
                לאשר ולשמור
              </button>
              <button className="secondary" onClick={props.onReject}>
                לוותר
              </button>
            </div>
          </div>
        )}
        <div ref={props.chatBottomRef} />
      </div>
    </>
  );
}
