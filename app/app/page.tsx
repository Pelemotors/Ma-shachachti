import { Suspense } from "react";
import { ChatApp } from "@/components/chat-app";

export default function AppPage() {
  return (
    <Suspense fallback={<div className="full-status">טוען…</div>}>
      <ChatApp />
    </Suspense>
  );
}
