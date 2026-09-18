import type { ReactNode } from "react";
import Link from "next/link";

export function LegalShell(props: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main className="lean-shell legal-page" dir="rtl" lang="he">
      <header className="legal-header">
        <p className="legal-brand">מה שכחתי?</p>
        <h1>{props.title}</h1>
        {props.updated ? (
          <p className="muted legal-updated">עודכן לאחרונה: {props.updated}</p>
        ) : null}
      </header>
      <article className="legal-body">{props.children}</article>
      <footer className="legal-footer muted">
        <Link href="/privacy">מדיניות פרטיות</Link>
        {" · "}
        <Link href="/account-deletion">מחיקת חשבון</Link>
        {" · "}
        <Link href="/login">כניסה</Link>
      </footer>
    </main>
  );
}
