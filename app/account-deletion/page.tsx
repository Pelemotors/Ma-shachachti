import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/privacy/legal-shell";
import { AccountDeletionClient } from "@/components/privacy/account-deletion-client";

export const metadata: Metadata = {
  title: "מחיקת חשבון – מה שכחתי?",
  description: "איך למחוק את החשבון באפליקציית מה שכחתי?",
  robots: { index: true, follow: true },
};

export default function AccountDeletionPage() {
  return (
    <LegalShell title="מחיקת חשבון – מה שכחתי?" updated="18 בספטמבר 2026">
      <p>
        בעמוד זה אפשר להתחיל מחיקה של חשבון ב־«מה שכחתי?» מהדפדפן — בלי
        להתקין מחדש את האפליקציה.
      </p>

      <h2>מה נמחק</h2>
      <ul>
        <li>החשבון עצמו וסשני ההתחברות</li>
        <li>משימות, רשימות, שיחות, זיכרונות והעדפות</li>
        <li>הקלטות ותמלילים</li>
        <li>אסימוני התראות ורישומי מכשיר</li>
      </ul>

      <h2>מה עשוי להישאר זמנית</h2>
      <ul>
        <li>רשומת ביקורת שמבקשת המחיקה בוצעה (ללא קישור למשתמש פעיל)</li>
        <li>עותקים בגיבויים תפעוליים עד לסבב הגיבוי הבא</li>
        <li>מידע אצל ספקי עיבוד חיצוניים לפי מדיניותם</li>
      </ul>

      <p>
        פירוט מלא:{" "}
        <Link href="/privacy">מדיניות הפרטיות</Link>.
      </p>

      <AccountDeletionClient />

      <h2>זמן טיפול</h2>
      <p>
        במחיקה עצמית מחוברת — המחיקה מתבצעת מיד בשרת הפעיל. אם מופיעה שגיאה,
        החשבון אינו נמחק חלקית כ«הצלחה»; יש לנסות שוב או לפנות אל{" "}
        <a href="mailto:noreply@mashachachti.co.il">
          noreply@mashachachti.co.il
        </a>
        .
      </p>
    </LegalShell>
  );
}
