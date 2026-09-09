"use client";
import { SeasonalPublicShell } from "@/components/seasonal-public-shell";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <SeasonalPublicShell>
      <main className="center">
        <div className="brand-mark">מ׳</div>
        <h1>משהו התעכב בדרך</h1>
        <p>אפשר לנסות לפתוח שוב את המסך.</p>
        <button className="primary" onClick={reset}>
          לנסות שוב
        </button>
      </main>
    </SeasonalPublicShell>
  );
}
