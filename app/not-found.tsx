import Link from "next/link";
import { SeasonalPublicShell } from "@/components/seasonal-public-shell";

export default function NotFound() {
  return (
    <SeasonalPublicShell>
      <main className="center">
        <div className="brand-mark">מ׳</div>
        <h1>העמוד הזה לא נמצא</h1>
        <Link className="primary" href="/">
          חזרה לבית
        </Link>
      </main>
    </SeasonalPublicShell>
  );
}
