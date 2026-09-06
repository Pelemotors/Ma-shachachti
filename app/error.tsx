"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="center">
      <h1>משהו התעכב בדרך</h1>
      <p>אפשר לנסות לפתוח שוב את המסך.</p>
      <button onClick={reset}>לנסות שוב</button>
    </main>
  );
}
