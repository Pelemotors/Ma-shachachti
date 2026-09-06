import Link from "next/link";
export default function NotFound() {
  return (
    <main className="center">
      <h1>העמוד הזה לא נמצא</h1>
      <Link href="/">חזרה לבית</Link>
    </main>
  );
}
