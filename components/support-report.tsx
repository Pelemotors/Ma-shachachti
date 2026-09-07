"use client";
import { useRef, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import { Dialog } from "./dialog";

const ACCEPTED = "image/png,image/jpeg,image/webp,video/mp4";
const MAX = 8 * 1024 * 1024;

export function SupportReport() {
  const [open, setOpen] = useState(false),
    [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function send() {
    if (!text.trim()) return setMsg("כתבי בקצרה מה קרה.");
    if (file && file.size > MAX)
      return setMsg("הקובץ גדול מדי. אפשר עד 8MB.");
    if (file && !ACCEPTED.split(",").includes(file.type))
      return setMsg("סוג הקובץ אינו נתמך. אפשר PNG, JPG, WEBP או MP4.");
    setBusy(true);
    setMsg("");
    try {
      const f = new FormData();
      f.set("description", text);
      f.set("page", location.href);
      f.set("userAgent", navigator.userAgent);
      if (file) f.set("media", file);
      const r = await authFetch("/api/support/report", {
        method: "POST",
        body: f,
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        throw new Error(d?.error ?? "לא הצלחנו לשלוח.");
      }
      setMsg("נשלח ✓ תודה, נטפל בזה.");
      setText("");
      setFile(null);
      setTimeout(() => setOpen(false), 1200);
    } catch (e) {
      setMsg(
        e instanceof Error
          ? e.message
          : "לא הצלחנו לשלוח. בדקי את החיבור ונסי שוב.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        aria-label="דיווח על תקלה"
        title="דיווח על תקלה"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          left: 16,
          bottom: "calc(86px + env(safe-area-inset-bottom))",
          zIndex: 29,
          border: 0,
          borderRadius: 999,
          padding: "12px 16px",
          boxShadow: "0 4px 18px #0002",
        }}
      >
        ⚠️ תקלה?
      </button>
      {open && (
        <Dialog title="משהו לא עובד?" onClose={() => setOpen(false)}>
          <section className="panel stack" style={{ maxHeight: "80vh", overflow: "auto" }}>
            <p>
              צלמי את התקלה או צרפי תמונה, וכתבי במשפט מה קרה. זה יגיע ישירות
              לצוות.
            </p>
            <textarea
              rows={4}
              placeholder="לדוגמה: לחצתי על 'מה שכחתי?' ולא קרה כלום"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <input
              ref={input}
              type="file"
              accept={ACCEPTED}
              capture="environment"
              hidden
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                setMsg("");
              }}
            />
            <button className="secondary" onClick={() => input.current?.click()}>
              {file ? `📎 ${file.name}` : "📷 צילום / צירוף מסך"}
            </button>
            <button className="primary" disabled={busy} onClick={send}>
              {busy ? "שולח…" : "שליחת דיווח"}
            </button>
            {msg && <p role="status">{msg}</p>}
            <small>
              הדיווח כולל את העמוד וסוג המכשיר כדי שנוכל לאתר את התקלה. כתובת
              המייל של הצוות אינה מוצגת.
            </small>
          </section>
        </Dialog>
      )}
    </>
  );
}
